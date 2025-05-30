import crypto, { verify } from 'crypto';
import { KeyedObject, userDir, PermissionType } from '../../Types.ts';
import fs from 'fs';
import { spooderLog } from '../Logging.ts';
import { v4 } from 'uuid';
import { Request } from 'express';

interface TrustedUsers {
  user_names: KeyedObject;
  display_names: KeyedObject;
  pending: KeyedObject;
  permissions: KeyedObject;
}

interface UserFile {
  trusted_users: TrustedUsers;
  trusted_users_pw: KeyedObject;
}

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

        const parsedUsers: UserFile = JSON.parse(userFile);
        if (!parsedUsers.trusted_users.pending) {
          spooderLog('Upgrading users file');

          const newUsernames = {} as KeyedObject;
          const newDisplayNames = {} as KeyedObject;
          for (let u in parsedUsers.trusted_users.permissions) {
            newUsernames[u] = u;
            newDisplayNames[u] = u;
          }

          parsedUsers.trusted_users = {
            user_names: newUsernames,
            display_names: newDisplayNames,
            pending: {},
            permissions: parsedUsers.trusted_users.permissions,
          } as TrustedUsers;
        }
        UserService.instance.users = parsedUsers as UserFile;
      }
    } catch (e: any) {
      console.log('Users file error', e);
    }
  }

  users = {
    trusted_users: {} as TrustedUsers,
    trusted_users_pw: {} as KeyedObject,
  };

  activeUsers = {} as KeyedObject;
  activeViewers = {} as KeyedObject;

  private saveUsers() {
    fs.writeFileSync(userDir + '/settings/users.json', JSON.stringify(UserService.instance.users));
  }

  static getUsers() {
    const users = UserService.instance.users;
    const hasPassword = {} as KeyedObject;
    for (let u in users.trusted_users.user_names) {
      const userId = users.trusted_users.user_names[u];
      hasPassword[userId] = users.trusted_users_pw[userId] !== undefined;
    }

    return {
      trusted_users: users.trusted_users,
      trusted_users_pw: hasPassword,
    };
  }

  static setTrustedUsers(newUsers: TrustedUsers) {
    UserService.instance.users.trusted_users = newUsers;
    UserService.instance.saveUsers();
  }

  private generateInviteCode() {
    return crypto.randomBytes(16).toString('hex');
  }

  static createUser(permissions: PermissionType[]) {
    const code = UserService.instance.generateInviteCode();
    const userId = v4();
    UserService.instance.users.trusted_users.pending[code] = {
      userId: userId,
      permissions,
    };
    UserService.instance.saveUsers();
  }

  static verifyUserInviteCode(registerInfo: KeyedObject, code: string) {
    const pendingUser = UserService.instance.users.trusted_users.pending[code];
    if (pendingUser == null) {
      return false;
    }

    const userId = pendingUser.userId;
    const newPermissions = pendingUser.permissions;
    const newUserName = registerInfo.username;
    const newDisplayName = registerInfo.display_name;
    const newPassword = registerInfo.password;

    UserService.instance.users.trusted_users.user_names[newUserName] = userId;
    UserService.instance.users.trusted_users.display_names[userId] = newDisplayName;
    UserService.instance.users.trusted_users.permissions[userId] = newPermissions;
    UserService.instance.saveUsers();
    UserService.instance.setPassword(userId, newPassword, false);
    delete UserService.instance.users.trusted_users.pending[code];

    return true;
  }

  static resetPassword(username: string) {
    const userId = UserService.instance.users.trusted_users.user_names[username];
    const newPassword = crypto.randomBytes(8).toString('hex');
    UserService.instance.setPassword(userId, newPassword, true);
    UserService.instance.saveUsers();

    return newPassword;
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

  static getActiveViewerFromCookie(platform: string, cookie: string) {
    return UserService.instance.activeViewers[platform]?.[cookie];
  }

  static getActiveViewer(req: Request) {
    return UserService.getActiveViewerFromCookie(
      req.cookies.public_module,
      req.cookies.access_token,
    );
  }

  static registerActiveViewer(
    userData: KeyedObject,
    platform: string,
    access_token: string,
    expiration_time: number,
  ) {
    if (UserService.instance.activeViewers[platform] === undefined) {
      UserService.instance.activeViewers[platform] = {} as KeyedObject;
    }
    UserService.instance.activeViewers[platform][access_token] = { ...userData, expiration_time };
  }

  static checkPermission(username: string, permissionTypes: PermissionType[]) {
    return permissionTypes.some((permissionType) =>
      UserService.instance.users.trusted_users.permissions[username].includes(permissionType),
    );
  }

  static cancelPendingUser(code: string) {
    delete UserService.instance.users.trusted_users.pending[code];
  }

  static hasPassword(username: string) {
    return UserService.instance.users.trusted_users_pw[username] !== undefined;
  }

  static isPasswordTemporary(username: string) {
    const userId = UserService.instance.users.trusted_users.user_names[username];
    return UserService.instance.users.trusted_users_pw[userId].temporary;
  }

  private setPassword(userId: string, newPassword: string, temporary: boolean) {
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = crypto.pbkdf2Sync(newPassword, newSalt, 1000, 64, `sha512`).toString('hex');
    UserService.instance.users.trusted_users_pw[userId] = {
      salt: newSalt,
      hash: newHash,
      temporary: temporary,
    };

    UserService.instance.saveUsers();
  }

  static matchPassword(username: string, password: string) {
    const userId = UserService.instance.users.trusted_users.user_names[username];
    const pwInfo = UserService.instance.users.trusted_users_pw[userId];
    return (
      crypto.pbkdf2Sync(password, pwInfo.salt, 1000, 64, `sha512`).toString(`hex`) === pwInfo.hash
    );
  }

  static changeUsername(oldUsername: string, newUsername: string) {
    const users = UserService.instance.users.trusted_users;
    if (users.user_names[newUsername] !== undefined) {
      return false;
    }

    users.user_names[newUsername] = users.user_names[oldUsername];
    delete users.user_names[oldUsername];
  }
}
