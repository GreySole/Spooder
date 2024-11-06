import crypto from 'crypto';
import { KeyedObject, userDir, PermissionType } from '../../Types.ts';
import fs from 'fs';

export default class UserService {
  private static instance: UserService;

  constructor() {
    if (UserService.instance) {
      return UserService.instance;
    }

    UserService.instance = this;

    try {
      const userFilePath = userDir + '/settings/users.json';
      if (!fs.existsSync(userFilePath)) {
        UserService.instance.saveUsers();
      } else {
        const userFile = fs.readFileSync(userFilePath, {
          encoding: 'utf8',
        });
        UserService.instance.users = JSON.parse(userFile);
      }
    } catch (e: any) {
      console.log('Users file error', e);
    }
  }

  users = {
    trusted_users: {} as KeyedObject,
    trusted_users_pw: {} as KeyedObject,
  };

  activeUsers = {} as KeyedObject;
  activeMods = {} as KeyedObject;

  pendingUsers = {} as KeyedObject;
  pendingMods = {} as KeyedObject;

  private saveUsers() {
    fs.writeFileSync(userDir + '/settings/users.json', JSON.stringify(UserService.instance.users));
  }

  static getUsers() {
    const users = UserService.instance.users;
    const hasPassword = {} as KeyedObject;

    for (let u in users.trusted_users.userId) {
      const userId = users.trusted_users.userId[u];
      hasPassword[userId] = users.trusted_users_pw[userId] !== undefined;
    }

    return {
      trusted_users: users.trusted_users,
      trusted_users_pw: hasPassword,
    };
  }

  static deletePassword(username: string) {
    const userId = UserService.instance.users.trusted_users.userId[username];
    delete UserService.instance.users.trusted_users_pw[userId];
    fs.writeFileSync(userDir + '/settings/users.json', JSON.stringify(UserService.instance.users));
  }

  static getActiveUsers() {
    return Object.values(UserService.instance.activeUsers);
  }

  static getActiveUserFromCookie(cookie: string) {
    return UserService.instance.activeUsers[cookie];
  }

  static setActiveUser(username: string, cookie: string) {
    UserService.instance.activeUsers[cookie] = username;
  }

  static isActive(token: string) {
    return UserService.instance.activeUsers[token] !== undefined;
  }

  static checkPermission(username: string, permissionTypes: PermissionType[]) {
    return permissionTypes.every((permissionType) =>
      UserService.instance.users.trusted_users.permission[username].includes(permissionType),
    );
  }

  static setPendingUser(type: string, username: string) {
    UserService.instance.pendingUsers[username] = {
      vtype: type,
      sUsername: username,
      verified: false,
    };
  }

  static getPendingUser(username: string) {
    return UserService.instance.pendingUsers[username];
  }

  static cancelPendingUser(username: string) {
    delete UserService.instance.pendingUsers[username];
  }

  static verifyUser(username: string) {
    UserService.instance.pendingUsers[username].verified = true;
  }

  static isVerified(username: string) {
    return UserService.instance.pendingUsers[username].verified;
  }

  static hasPassword(username: string) {
    return UserService.instance.users.trusted_users_pw[username] !== undefined;
  }

  static setPassword(username: string, newPassword: string) {
    if (UserService.isVerified(username)) {
      delete UserService.instance.pendingUsers[username];
      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHash = crypto.pbkdf2Sync(newPassword, newSalt, 1000, 64, `sha512`).toString('hex');
      UserService.instance.users.trusted_users_pw[username] = {
        salt: newSalt,
        hash: newHash,
      };
    }
    fs.writeFileSync(userDir + '/settings/users.json', JSON.stringify(UserService.instance.users));
  }

  static matchPassword(username: string, password: string) {
    const pwInfo = UserService.instance.users.trusted_users_pw[username];
    return (
      crypto.pbkdf2Sync(password, pwInfo.salt, 1000, 64, `sha512`).toString(`hex`) === pwInfo.hash
    );
  }

  static changeUsername(oldUsername: string, newUsername: string) {
    if (UserService.instance.users.trusted_users.permission[newUsername]) {
      console.log('Change Username Error: New username already exists');
      return;
    }

    UserService.instance.users.trusted_users.permissions[newUsername] = Object.assign(
      {},
      UserService.instance.users.trusted_users.permission[oldUsername],
    );
    delete UserService.instance.users.trusted_users.permission[oldUsername];

    const userVerifications = UserService.instance.users.trusted_users.verify;
    for (let v in userVerifications) {
      if (userVerifications[v][oldUsername]) {
        UserService.instance.users.trusted_users.verify[v][newUsername] = Object.assign(
          {},
          userVerifications[v][oldUsername],
        );
        delete UserService.instance.users.trusted_users.verify[v][oldUsername];
      }
    }

    if (UserService.instance.users.trusted_users_pw[oldUsername]) {
      UserService.instance.users.trusted_users_pw[newUsername] = Object.assign(
        {},
        UserService.instance.users.trusted_users_pw[oldUsername],
      );
      delete UserService.instance.users.trusted_users_pw[oldUsername];
    }
  }
}
