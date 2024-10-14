import crypto from 'crypto';
import { KeyedObject, backendDir, PermissionType } from '../../Types.ts';
import fs from 'fs';

export default class UserManager {
  private static instance: UserManager;

  constructor() {
    if (UserManager.instance) {
      return UserManager.instance;
    }

    UserManager.instance = this;

    try {
      const userFilePath = backendDir + '/settings/users.json';
      if (!fs.existsSync(userFilePath)) {
        UserManager.instance.saveUsers();
      } else {
        const userFile = fs.readFileSync(userFilePath, {
          encoding: 'utf8',
        });
        UserManager.instance.users = JSON.parse(userFile);
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
    fs.writeFileSync(
      backendDir + '/settings/users.json',
      JSON.stringify(UserManager.instance.users),
    );
  }

  static getUsers() {
    const users = UserManager.instance.users;
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
    const userId = UserManager.instance.users.trusted_users.userId[username];
    delete UserManager.instance.users.trusted_users_pw[userId];
    fs.writeFileSync(
      backendDir + '/settings/users.json',
      JSON.stringify(UserManager.instance.users),
    );
  }

  static getActiveUsers() {
    return Object.values(UserManager.instance.activeUsers);
  }

  static getActiveUserFromToken(token: string) {
    return UserManager.instance.activeUsers[token];
  }

  static setActiveUser(username: string, cookie: string) {
    UserManager.instance.activeUsers[cookie] = username;
  }

  static isActive(token: string) {
    return UserManager.instance.activeUsers[token] !== undefined;
  }

  static checkPermission(username: string, permissionTypes: PermissionType[]) {
    return permissionTypes.every((permissionType) =>
      UserManager.instance.users.trusted_users.permission[username].includes(permissionType),
    );
  }

  static setPendingUser(type: string, username: string) {
    UserManager.instance.pendingUsers[username] = {
      vtype: type,
      sUsername: username,
      verified: false,
    };
  }

  static getPendingUser(username: string) {
    return UserManager.instance.pendingUsers[username];
  }

  static cancelPendingUser(username: string) {
    delete UserManager.instance.pendingUsers[username];
  }

  static verifyUser(username: string) {
    UserManager.instance.pendingUsers[username].verified = true;
  }

  static isVerified(username: string) {
    return UserManager.instance.pendingUsers[username].verified;
  }

  static hasPassword(username: string) {
    return UserManager.instance.users.trusted_users_pw[username] !== undefined;
  }

  static setPassword(username: string, newPassword: string) {
    if (UserManager.isVerified(username)) {
      delete UserManager.instance.pendingUsers[username];
      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHash = crypto.pbkdf2Sync(newPassword, newSalt, 1000, 64, `sha512`).toString('hex');
      UserManager.instance.users.trusted_users_pw[username] = {
        salt: newSalt,
        hash: newHash,
      };
    }
    fs.writeFileSync(
      backendDir + '/settings/users.json',
      JSON.stringify(UserManager.instance.users),
    );
  }

  static matchPassword(username: string, password: string) {
    const pwInfo = UserManager.instance.users.trusted_users_pw[username];
    return (
      crypto.pbkdf2Sync(password, pwInfo.salt, 1000, 64, `sha512`).toString(`hex`) === pwInfo.hash
    );
  }

  static changeUsername(oldUsername: string, newUsername: string) {
    if (UserManager.instance.users.trusted_users.permission[newUsername]) {
      console.log('Change Username Error: New username already exists');
      return;
    }

    UserManager.instance.users.trusted_users.permissions[newUsername] = Object.assign(
      {},
      UserManager.instance.users.trusted_users.permission[oldUsername],
    );
    delete UserManager.instance.users.trusted_users.permission[oldUsername];

    const userVerifications = UserManager.instance.users.trusted_users.verify;
    for (let v in userVerifications) {
      if (userVerifications[v][oldUsername]) {
        UserManager.instance.users.trusted_users.verify[v][newUsername] = Object.assign(
          {},
          userVerifications[v][oldUsername],
        );
        delete UserManager.instance.users.trusted_users.verify[v][oldUsername];
      }
    }

    if (UserManager.instance.users.trusted_users_pw[oldUsername]) {
      UserManager.instance.users.trusted_users_pw[newUsername] = Object.assign(
        {},
        UserManager.instance.users.trusted_users_pw[oldUsername],
      );
      delete UserManager.instance.users.trusted_users_pw[oldUsername];
    }
  }
}
