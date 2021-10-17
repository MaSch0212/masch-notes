import { Injectable } from '@angular/core';
import { AuthenticationService } from './authentication.service';
import * as CryptoJS from 'crypto-js';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class EncryptionService {
    private iv: any;

    constructor(private authService: AuthenticationService) {
        this.iv = CryptoJS.enc.Utf8.parse('d6c6b426090a5ae9');
    }

    encrypt(text: string): Observable<string> {
        return this.authService
            .createEncryptKey()
            .pipe(
                map((encryptKey: string) =>
                    this.encryptWithKey(text, encryptKey)
                )
            );
    }
    encryptWithKey(text: string, encryptKey: string): string {
        return CryptoJS.AES.encrypt(
            text,
            CryptoJS.enc.Base64.parse(encryptKey),
            { iv: this.iv }
        ).toString();
    }

    decrypt(encryptedText: string) {
        return this.authService
            .createEncryptKey()
            .pipe(
                map((encryptKey: string) =>
                    this.decryptWithKey(encryptedText, encryptKey)
                )
            );
    }
    decryptWithKey(encryptedText: string, encryptKey: string): string {
        return CryptoJS.AES.decrypt(
            encryptedText,
            CryptoJS.enc.Base64.parse(encryptKey),
            { iv: this.iv }
        ).toString(CryptoJS.enc.Utf8);
    }
}
