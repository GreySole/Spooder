import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import ModuleService from '../../core/service/ModuleService';
import Twitch from './main';
import { findAvailablePort, WebService } from '../../core/service/WebService';

//Twitch CLI Download: https://github.com/twitchdev/twitch-cli/releases/latest

const execAsync = promisify(exec);

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

    // Start 5-minute timer (300000 ms)
    this.testServerTimer = setTimeout(() => {
      console.log('Test server timeout reached (5 minutes), stopping server...');
      this.stopTestServer();
    }, 60000);
  }

  private resetTestServerTimer(): void {
    if (this.isTestServerRunning()) {
      this.startTestServerTimer();
    }
  }

  public async testEventCommand(eventName: string, extraArgs: string = ''): Promise<void> {
    const twitchModule = this.getModule();
    if (twitchModule.loggedIn === false) {
      return;
    }

    const useWebhook = twitchModule.oauth.useWebhookTransport;

    try {
      if (useWebhook) {
        const publicUrl = WebService.getPublicHTTPUrl();
        await this.executeCommand(
          `event trigger ${eventName} -F ${publicUrl}/twitch/webhooks/eventsub ${extraArgs}`,
        );
      } else {
        if (!this.isTestServerRunning()) {
          const port = await findAvailablePort(8080);
          await this.startTestServer(port);
        }
        await this.executeCommand(`event trigger ${eventName} ${extraArgs} --transport=websocket`);
      }
    } catch (e) {
      console.error('Error testing event command:', e);
    }
  }

  private startTestServer(port: number) {
    return new Promise<void>((res, rej) => {
      if (this.testServerProcess) {
        console.log('Test server is already running');
        return;
      }

      const executablePath = path.resolve(this.cliPath, this.platformInfo.executable);

      if (!fs.existsSync(executablePath)) {
        console.error('Twitch CLI not found. Please ensure it is downloaded and installed.');
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
        // Start the 5-minute timer after test server is ready
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

  async executeCommand(
    command: string,
    args: string[] = [],
  ): Promise<{ stdout: string; stderr: string }> {
    const executablePath = path.resolve(this.cliPath, this.platformInfo.executable);

    if (!fs.existsSync(executablePath)) {
      throw new Error('Twitch CLI not found. Please ensure it is downloaded and installed.');
    }

    const fullCommand = `"${executablePath}" ${command} ${args.join(' ')}`;
    console.log('Executing command:', fullCommand);

    // Reset the test server timer whenever a command is executed
    this.resetTestServerTimer();

    try {
      const result = await execAsync(fullCommand);
      return result;
    } catch (error: any) {
      console.error('Error details:', error.message);
      if (error.stderr) {
        console.error('stderr:', error.stderr);
      }
      if (error.stdout) {
        console.error('stdout:', error.stdout);
      }
      throw new Error(`Twitch CLI command failed: ${error.message}`);
    }
  }

  async version(): Promise<string> {
    try {
      const result = await this.executeCommand('version');
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
