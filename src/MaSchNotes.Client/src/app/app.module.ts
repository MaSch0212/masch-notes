import { BrowserModule, DomSanitizer } from '@angular/platform-browser';
import { NgModule, InjectionToken } from '@angular/core';

import { AppComponent } from './components/app.component';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './modules/app-routing.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AngularMaterialModule } from './modules/angular-material.module';
import { HomeComponent } from './components/home/home.component';
import { OverviewComponent } from './components/overview/overview.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ErrorPageComponent } from './components/error-page/error-page.component';
import { LoginComponent } from './components/home/login/login.component';
import { RegisterComponent } from './components/home/register/register.component';
import { MatIconRegistry } from '@angular/material/icon';
import { NotebooksComponent } from './components/notebooks/notebooks.component';
import { NotebookComponent } from './components/notebooks/notebook/notebook.component';
import { NotebookOverviewComponent } from './components/notebook-overview/notebook-overview.component';
import { NotebookEntryComponent } from './components/notebooks/notebook/notebook-entry/notebook-entry.component';
import { CreateNotebookDialogComponent } from './components/dialogs/create-notebook-dialog/create-notebook-dialog.component';
import { WarningDialogComponent } from './components/dialogs/warning-dialog/warning-dialog.component';
import { DatePipe } from '@angular/common';
import { TextInputDialogComponent } from './components/dialogs/text-input-dialog/text-input-dialog.component';
import { DayRatingOverviewComponent } from './components/overview/day-rating-overview/day-rating-overview.component';
import { RateDayComponent } from './components/day-rating/rate-day/rate-day.component';
import { DayRatingComponent } from './components/day-rating/day-rating.component';
import { CalendarRateDayComponent } from './components/day-rating/calendar-rate-day/calendar-rate-day.component';
import { ApiKeysComponent } from './components/settings/api-keys/api-keys.component';
import { CreateApiKeyDialogComponent } from './components/dialogs/create-api-key-dialog/create-api-key-dialog.component';
import { DeleteWarningDialogComponent } from './components/dialogs/delete-warning-dialog/delete-warning-dialog.component';
import { CopyApiKeyDialogComponent } from './components/dialogs/copy-api-key-dialog/copy-api-key-dialog.component';

@NgModule({
    declarations: [
        AppComponent,
        HomeComponent,
        OverviewComponent,
        SettingsComponent,
        ErrorPageComponent,
        LoginComponent,
        RegisterComponent,
        NotebooksComponent,
        NotebookComponent,
        NotebookOverviewComponent,
        NotebookEntryComponent,
        CreateNotebookDialogComponent,
        WarningDialogComponent,
        TextInputDialogComponent,
        DayRatingOverviewComponent,
        RateDayComponent,
        DayRatingComponent,
        CalendarRateDayComponent,
        ApiKeysComponent,
        CreateApiKeyDialogComponent,
        DeleteWarningDialogComponent,
        CopyApiKeyDialogComponent
    ],
    imports: [
        BrowserModule,
        HttpClientModule,
        AppRoutingModule,
        FormsModule,
        BrowserAnimationsModule,
        AngularMaterialModule
    ],
    entryComponents: [
        CreateNotebookDialogComponent,
        WarningDialogComponent,
        TextInputDialogComponent,
        CalendarRateDayComponent,
        CreateApiKeyDialogComponent,
        DeleteWarningDialogComponent,
        CopyApiKeyDialogComponent
    ],
    providers: [DatePipe],
    bootstrap: [AppComponent]
})
export class AppModule {
    constructor(matIconRegistry: MatIconRegistry, domSanitizer: DomSanitizer) {
        matIconRegistry.addSvgIconSet(
            domSanitizer.bypassSecurityTrustResourceUrl('./assets/mdi.svg')
        );
    }
}
