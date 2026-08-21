import { ChildProcess, exec, execFile, spawn } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { promisify } from 'util';
import ModuleService from '../../core/service/ModuleService';
import { findAvailablePort, WebService } from '../../core/service/WebService';
import Twitch from './twitch';
import { getSubscriptionVersion } from './TwitchEventSubTriggers';

//Twitch CLI Download: https://github.com/twitchdev/twitch-cli/releases/latest

const execAsync = promisify(exec);
// Used for every CLI invocation: argv goes to the process directly, with no shell to quote
// against. Test arguments originate in the WebUI, so a shell here would make a reward title
// or username an injection point.
const execFileAsync = promisify(execFile);

// How long the CLI's local EventSub server stays up after the last test command.
const TEST_SERVER_IDLE_MS = 60000;

interface PlatformInfo {
  platform: string;
  arch: string;
  filename: string;
  executable: string;
}

export default class TwitchCLI {
  private cliPath: string;
  private platformInfo: PlatformInfo = {} as PlatformInfo;
  private testServerProcess: ChildProcess | null = null;
  private testServerTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.cliPath = path.resolve('user/twitch/cli'); // Path to the Twitch CLI executable
    console.log('Twitch CLI Path:', this.cliPath);
    this.platformInfo = this.detectPlatform();
  }

  getModule = () => {
    return ModuleService.getStreamModule('twitch') as Twitch;
  };

  private startTestServerTimer(): void {
    // Clear existing timer if any
    if (this.testServerTimer) {
      clearTimeout(this.testServerTimer);
    }

    // The test server hijacks Spooder's EventSub socket, so it isn't left running: it shuts
    // itself down a minute after the last command. executeCommand restarts this clock on every
    // trigger, so an active testing session keeps it alive without the user managing it.
    this.testServerTimer = setTimeout(() => {
      console.log(
        `Test server idle for ${TEST_SERVER_IDLE_MS / 1000}s, stopping server and returning to live events...`,
      );
      this.stopTestServer();
    }, TEST_SERVER_IDLE_MS);
  }

  private resetTestServerTimer(): void {
    if (this.isTestServerRunning()) {
      this.startTestServerTimer();
    }
  }

  // Fire one mock EventSub notification at Spooder through the Twitch CLI.
  //
  // `eventName` is the real EventSub subscription type ('channel.follow'): the CLI accepts a
  // topic as an alias for its own shorthand on both transports, so nothing here needs a second
  // naming scheme. `extraArgs` is argv, already vetted by the caller.
  //
  // Two flags are always added and are what make the test reach a graph at all. `--to-user` is
  // the broadcaster the mock event happens to - without it the CLI invents a random id and
  // OnEventSubReceived drops the event as belonging to another channel. `--version` pins the
  // same subscription version the transports subscribe with, and is required outright for
  // channel.update, which the CLI ships in two versions.
  public async testEventCommand(
    eventName: string,
    extraArgs: string[] = [],
  ): Promise<{ stdout: string; stderr: string }> {
    const twitchModule = this.getModule();
    if (twitchModule.loggedIn === false) {
      throw new Error('Not logged in to Twitch.');
    }

    const broadcasterId = await twitchModule.api.getBroadcasterId();
    const args = [
      'event',
      'trigger',
      eventName,
      '--to-user',
      broadcasterId,
      '--version',
      getSubscriptionVersion(eventName),
      ...extraArgs,
    ];

    if (twitchModule.oauth.useWebhookTransport) {
      const publicUrl = WebService.getPublicHTTPUrl();
      if (!publicUrl) {
        throw new Error(
          'No public URL available. Webhook transport needs external hosting to be up.',
        );
      }
      return await this.executeCommand([
        ...args,
        '--forward-address',
        `${publicUrl}/twitch/webhooks/eventsub`,
      ]);
    }

    // WebSocket transport can't take a mock event from Twitch's own servers, so the CLI hosts
    // a local EventSub server and Spooder's socket is repointed at it for the duration. Real
    // events don't arrive while that's true - hence the auto-stop timer, and why the WebUI
    // reports test mode as a state the user can leave.
    if (!this.isTestServerRunning()) {
      const port = await findAvailablePort(8080);
      await this.startTestServer(port);
    }
    return await this.executeCommand([...args, '--transport=websocket']);
  }

  private startTestServer(port: number) {
    return new Promise<void>((res, rej) => {
      if (this.testServerProcess) {
        console.log('Test server is already running');
        res();
        return;
      }

      const executablePath = path.resolve(this.cliPath, this.platformInfo.executable);

      if (!fs.existsSync(executablePath)) {
        rej(new Error('Twitch CLI not found. Install it before running a test.'));
        return;
      }

      console.log('Starting Twitch CLI websocket test server...');

      this.testServerProcess = spawn(
        executablePath,
        ['event', 'websocket', 'start-server', '-p', port.toString()],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      this.testServerProcess.stdout?.on('data', (data) => {
        console.log('Twitch CLI Test Server:', data.toString());
      });

      this.testServerProcess.stderr?.on('data', (data) => {
        console.error('Twitch CLI Test Server Error:', data.toString());
      });

      this.testServerProcess.on('close', (code) => {
        console.log(`Twitch CLI test server exited with code ${code}`);
        this.testServerProcess = null;
      });

      this.testServerProcess.on('error', (error) => {
        console.error('Failed to start Twitch CLI test server:', error);
        this.testServerProcess = null;
      });

      const twitchModule = this.getModule();

      setTimeout(async () => {
        await twitchModule.eventsub.enableTestMode('127.0.0.1', port);
        // Start the idle timer once the server is actually accepting events.
        this.startTestServerTimer();
        res();
      }, 1000);
    });
  }

  public stopTestServer(): void {
    if (this.testServerProcess) {
      const twitchModule = this.getModule();
      twitchModule.eventsub.disableTestMode();
      console.log('Stopping Twitch CLI test server...');
      this.testServerProcess.kill('SIGTERM');
      this.testServerProcess = null;
    } else {
      console.log('No test server is currently running');
    }

    // Clear the timer when stopping the server
    if (this.testServerTimer) {
      clearTimeout(this.testServerTimer);
      this.testServerTimer = null;
    }
  }

  public isTestServerRunning(): boolean {
    return this.testServerProcess !== null && !this.testServerProcess.killed;
  }

  private detectPlatform(): PlatformInfo {
    const platform = process.platform;
    const arch = process.arch;

    switch (platform) {
      case 'win32':
        if (arch === 'x64') {
          return {
            platform: 'Windows',
            arch: 'x86_64',
            filename: 'twitch-cli_1.1.24_Windows_x86_64.zip',
            executable: 'twitch.exe',
          };
        } else {
          return {
            platform: 'Windows',
            arch: 'i386',
            filename: 'twitch-cli_1.1.24_Windows_i386.zip',
            executable: 'twitch.exe',
          };
        }
      case 'darwin':
        if (arch === 'arm64') {
          return {
            platform: 'Darwin',
            arch: 'arm64',
            filename: 'twitch-cli_1.1.24_Darwin_arm64.tar.gz',
            executable: 'twitch',
          };
        } else {
          return {
            platform: 'Darwin',
            arch: 'x86_64',
            filename: 'twitch-cli_1.1.24_Darwin_x86_64.tar.gz',
            executable: 'twitch',
          };
        }
      case 'linux':
        if (arch === 'arm64') {
          return {
            platform: 'Linux',
            arch: 'arm64',
            filename: 'twitch-cli_1.1.24_Linux_arm64.tar.gz',
            executable: 'twitch',
          };
        } else {
          return {
            platform: 'Linux',
            arch: 'x86_64',
            filename: 'twitch-cli_1.1.24_Linux_x86_64.tar.gz',
            executable: 'twitch',
          };
        }
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);

      https
        .get(url, (response) => {
          // Handle redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            file.destroy(); // Clean up the file stream
            return this.downloadFile(response.headers.location!, destPath)
              .then(resolve)
              .catch(reject);
          }

          if (response.statusCode !== 200) {
            file.destroy(); // Clean up the file stream
            reject(new Error(`Failed to download: ${response.statusCode}`));
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close((err) => {
              if (err) {
                console.error('Error closing file:', err);
                reject(err);
              } else {
                console.log('File download completed and closed successfully');
                // Add a small delay to ensure file handle is fully released
                setTimeout(() => resolve(), 500);
              }
            });
          });

          file.on('error', (err) => {
            file.destroy(); // Clean up the file stream
            fs.unlink(destPath, () => {}); // Delete the file on error
            reject(err);
          });
        })
        .on('error', (err) => {
          file.destroy(); // Clean up the file stream
          reject(err);
        });
    });
  }

  private async extractArchive(archivePath: string, extractPath: string): Promise<void> {
    const isWindows = this.platformInfo.platform === 'Windows';
    const isZip = path.extname(archivePath) === '.zip';

    try {
      // Create a temporary extraction directory
      const tempExtractPath = path.join(extractPath, 'temp_extract');
      fs.mkdirSync(tempExtractPath, { recursive: true });

      if (isZip) {
        // For ZIP files (Windows)
        if (isWindows) {
          console.log('Extracting ZIP on Windows:', path.basename(archivePath));

          // Check if file exists and get its stats
          if (fs.existsSync(archivePath)) {
            const stats = fs.statSync(archivePath);
            console.log(`Archive: ${stats.size} bytes`);
          } else {
            throw new Error(`Archive file does not exist: ${archivePath}`);
          }

          // Add a small delay to allow file handles to be released
          await new Promise((resolve) => setTimeout(resolve, 1000));

          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            try {
              console.log(`Extraction attempt ${attempts + 1}/${maxAttempts}`);

              const result = await execAsync(
                `powershell -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${tempExtractPath}' -Force"`,
              );
              console.log('Extraction successful');
              break; // Success, exit the retry loop
            } catch (error: any) {
              attempts++;
              console.error(`Attempt ${attempts} failed:`, error.message);

              if (attempts >= maxAttempts) {
                console.log('Trying alternative method...');

                // Try using cmd instead of direct PowerShell
                try {
                  await execAsync(
                    `cmd /c "powershell.exe -ExecutionPolicy Bypass -Command \\"Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${tempExtractPath}' -Force\\""`,
                  );
                  console.log('Alternative extraction successful');
                  break;
                } catch (cmdError: any) {
                  throw new Error(`All extraction methods failed: ${error.message}`);
                }
              } else {
                console.log(`Retrying in 2 seconds...`);
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
          }
        } else {
          // Use unzip on Unix-like systems
          await execAsync(`unzip -o "${archivePath}" -d "${tempExtractPath}"`);
        }
      } else {
        // For tar.gz files (Unix-like systems)
        await execAsync(`tar -xzf "${archivePath}" -C "${tempExtractPath}"`);
      }

      console.log('Extraction complete. Moving executable to correct location...');
      // Find and move the executable to the correct location
      await this.moveExecutableToCorrectLocation(tempExtractPath, extractPath);

      // Clean up temporary directory
      if (fs.existsSync(tempExtractPath)) {
        fs.rmSync(tempExtractPath, { recursive: true, force: true });
      }
    } catch (error) {
      throw new Error(`Failed to extract archive: ${error}`);
    }
  }

  private async moveExecutableToCorrectLocation(
    tempPath: string,
    finalPath: string,
  ): Promise<void> {
    const executableName = this.platformInfo.executable;

    // Function to recursively find the executable
    const findExecutable = (dir: string): string | null => {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isFile() && item === executableName) {
          return fullPath;
        } else if (stat.isDirectory()) {
          console.log(`Searching in directory: ${fullPath}`);
          const found = findExecutable(fullPath);
          if (found) return found;
        }
      }
      return null;
    };

    // Find the executable file
    const executablePath = findExecutable(tempPath);
    if (!executablePath) {
      throw new Error(`Could not find executable '${executableName}' in extracted files`);
    }

    // Get the directory containing the executable
    const executableDir = path.dirname(executablePath);

    // Copy all files from the executable's directory to the final path
    const items = fs.readdirSync(executableDir);
    for (const item of items) {
      const sourcePath = path.join(executableDir, item);
      const destPath = path.join(finalPath, item);

      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, destPath);
      } else {
        // For directories, copy recursively
        this.copyDirectorySync(sourcePath, destPath);
      }
    }
  }

  private copyDirectorySync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);

      if (fs.statSync(srcPath).isDirectory()) {
        this.copyDirectorySync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  async downloadTwitchCLI(): Promise<void> {
    fs.mkdirSync(this.cliPath, { recursive: true });
    const cliPath = this.cliPath;
    try {
      const downloadUrl = `https://github.com/twitchdev/twitch-cli/releases/download/v1.1.24/${this.platformInfo.filename}`;
      const archivePath = path.join(cliPath, this.platformInfo.filename);

      console.log(
        `Downloading Twitch CLI for ${this.platformInfo.platform} ${this.platformInfo.arch}...`,
      );
      await this.downloadFile(downloadUrl, archivePath);

      console.log(archivePath, cliPath);

      console.log('Extracting Twitch CLI...');
      await this.extractArchive(archivePath, cliPath);

      // Make executable on Unix-like systems
      if (this.platformInfo.platform !== 'Windows') {
        const executablePath = path.join(cliPath, this.platformInfo.executable);
        await execAsync(`chmod +x "${executablePath}"`);
      }

      // Clean up archive file
      fs.unlinkSync(archivePath);

      console.log('Twitch CLI installed successfully!');
    } catch (error) {
      console.error('Failed to download and install Twitch CLI:', error);
      throw error;
    }
  }

  // argv rather than a command string: see execFileAsync above. Callers pass each flag and
  // value as its own element and never quote anything themselves.
  async executeCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const executablePath = path.resolve(this.cliPath, this.platformInfo.executable);

    if (!fs.existsSync(executablePath)) {
      throw new Error('Twitch CLI not found. Please ensure it is downloaded and installed.');
    }

    console.log('Executing Twitch CLI:', executablePath, args.join(' '));

    // Reset the test server timer whenever a command is executed
    this.resetTestServerTimer();

    try {
      return await execFileAsync(executablePath, args);
    } catch (error: any) {
      // The CLI reports a bad event name or a rejected flag on stderr and exits non-zero, so
      // that text is the whole diagnosis - it goes back to the caller rather than only to the
      // console, where the WebUI could never see it.
      const detail = String(error.stderr || error.stdout || error.message).trim();
      console.error('Twitch CLI command failed:', detail);
      throw new Error(detail || 'Twitch CLI command failed');
    }
  }

  async version(): Promise<string> {
    try {
      const result = await this.executeCommand(['version']);
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Failed to get Twitch CLI version: ${error}`);
    }
  }

  isInstalled(): boolean {
    const executablePath = path.join(this.cliPath, this.platformInfo.executable);
    return fs.existsSync(executablePath);
  }

  getPlatformInfo(): PlatformInfo {
    return this.platformInfo;
  }

  getExecutablePath(): string {
    return path.join(this.cliPath, this.platformInfo.executable);
  }
}
