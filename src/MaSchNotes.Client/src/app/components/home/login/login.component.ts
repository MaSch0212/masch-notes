import {
    Component,
    OnInit,
    Output,
    EventEmitter,
    ViewChild,
    AfterViewInit
} from '@angular/core';
import { AuthenticationService } from '../../../services/authentication.service';
import { NgForm } from '@angular/forms';
import { LocalStorageService } from '../../../services/local-storage.service';

@Component({
    selector: 'masch-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, AfterViewInit {
    @ViewChild('f', { static: false }) loginForm: NgForm;
    @Output() login = new EventEmitter<void>();

    loginFailed = false;
    formInvalid = false;

    constructor(private authService: AuthenticationService, private localStorageService: LocalStorageService) {}

    ngOnInit() {}

    ngAfterViewInit() {
        setTimeout(() => {
            if (this.localStorageService.rememberUsername === 'true') {
                this.loginForm.form.patchValue({
                    username: this.localStorageService.username,
                    rememberUsername: true
                });
            }
        });
    }

    onLoginSubmit(form: NgForm) {
        this.formInvalid = form.invalid;
        if (form.invalid) {
            this.loginFailed = false;
            return;
        }

        this.localStorageService.rememberUsername = !form.value.rememberUsername ? 'false' : 'true';
        if (!!form.value.rememberUsername) {
            this.localStorageService.username = form.value.username;
        } else {
            this.localStorageService.username = null;
        }

        this.authService
            .login({
                ...form.value,
                stayLoggedIn: !!form.value.stayLoggedIn
            })
            .subscribe(result => {
                if (result) {
                    this.login.emit();
                } else {
                    this.loginFailed = true;
                }
            });
    }
}
