import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

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

  constructor() {
    this.cliPath = path.resolve('user/twitch/cli'); // Path to the Twitch CLI executable
    console.log('Twitch CLI Path:', this.cliPath);
    this.platformInfo = this.detectPlatform();

    if (!this.isInstalled()) {
      fs.mkdirSync(this.cliPath, { recursive: true });
      this.downloadTwitchCLI();
    } else {
    }
  }

  public testEventCommand() {
    this.executeCommand('event trigger follow -F https://lon.spooder.me/twitch/webhooks/eventsub');
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
            return this.downloadFile(response.headers.location!, destPath)
              .then(resolve)
              .catch(reject);
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: ${response.statusCode}`));
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            resolve();
          });

          file.on('error', (err) => {
            fs.unlink(destPath, () => {}); // Delete the file on error
            reject(err);
          });
        })
        .on('error', reject);
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
          await execAsync(
            `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tempExtractPath}' -Force"`,
          );
        } else {
          // Use unzip on Unix-like systems
          await execAsync(`unzip -o "${archivePath}" -d "${tempExtractPath}"`);
        }
      } else {
        // For tar.gz files (Unix-like systems)
        await execAsync(`tar -xzf "${archivePath}" -C "${tempExtractPath}"`);
      }

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
    const cliPath = this.cliPath;
    try {
      const downloadUrl = `https://github.com/twitchdev/twitch-cli/releases/download/v1.1.24/${this.platformInfo.filename}`;
      const archivePath = path.join(cliPath, this.platformInfo.filename);

      console.log(
        `Downloading Twitch CLI for ${this.platformInfo.platform} ${this.platformInfo.arch}...`,
      );
      await this.downloadFile(downloadUrl, archivePath);

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

    try {
      const result = await execAsync(fullCommand);
      return result;
    } catch (error: any) {
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
