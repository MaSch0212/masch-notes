import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {
  private readonly prefix = 'MaSchNotes.';
  private readonly tokenName = this.prefix + 'token';
  private readonly rememberUsernameName = this.prefix + 'rememberUsername';
  private readonly usernameName = this.prefix + 'username';
  private readonly encryptPassName = this.prefix + 'encryptPass';
  private readonly entryAutosaveName = this.prefix + 'entryAutosave';

  constructor() { }

  public get token(): string | null {
    return localStorage.getItem(this.tokenName);
  }
  public set token(value: string | null) {
    this.setItem(this.tokenName, value);
  }

  public get rememberUsername(): string | null {
    return localStorage.getItem(this.rememberUsernameName);
  }
  public set rememberUsername(value: string | null) {
    this.setItem(this.rememberUsernameName, value);
  }

  public get username(): string | null {
    return localStorage.getItem(this.usernameName);
  }
  public set username(value: string | null) {
    this.setItem(this.usernameName, value);
  }

  public get encryptPass(): string | null {
    return localStorage.getItem(this.encryptPassName);
  }
  public set encryptPass(value: string | null) {
    this.setItem(this.encryptPassName, value);
  }

  public get entryAutosave(): string | null {
    return localStorage.getItem(this.entryAutosaveName);
  }
  public set entryAutosave(value: string | null) {
    this.setItem(this.entryAutosaveName, value);
  }

  private setItem(key: string, value: string | null) {
    if (value) {
      localStorage.setItem(key, value);
    }
    else {
      localStorage.removeItem(key);
    }
  }
}
