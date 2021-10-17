import { Component, OnInit } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Settings } from '../../models/settings.model';

@Component({
    selector: 'masch-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
    settings: Settings;

    constructor(
        private settingsService: SettingsService,
        private snackbar: MatSnackBar
    ) {}

    ngOnInit() {
        this.settingsService.getSettings().subscribe(
            s => setTimeout(() => (this.settings = s), 0),
            () =>
                this.snackbar.open('Getting settings failed', null, {
                    panelClass: ['mat-warn']
                })
        );
    }
}
