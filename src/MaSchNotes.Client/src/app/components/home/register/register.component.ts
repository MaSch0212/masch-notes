import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { AuthenticationService } from '../../../services/authentication.service';
import { NgForm } from '@angular/forms';

@Component({
  selector: 'masch-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
    @Output() register = new EventEmitter<void>();

    registerFailed = false;
    formInvalid = false;

    constructor(private authService: AuthenticationService) {}

    ngOnInit() {}

    onRegisterSubmit(form: NgForm) {
        this.formInvalid = form.invalid;
        if (form.invalid) {
            this.registerFailed = false;
            return;
        }

        this.authService.register(form.value).subscribe(result => {
            if (result) {
                this.register.emit();
            } else {
                this.registerFailed = true;
            }
        });
    }
}
