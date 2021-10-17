import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthenticationService } from '../../services/authentication.service';
import { EncryptionService } from '../../services/encryption.service';

@Component({
    selector: 'masch-overview',
    templateUrl: './overview.component.html',
    styleUrls: ['./overview.component.scss']
})
export class OverviewComponent implements OnInit {
    constructor(
        private snackBar: MatSnackBar,
        private authService: AuthenticationService,
        private encryptService: EncryptionService
    ) {}

    ngOnInit() {}
}
