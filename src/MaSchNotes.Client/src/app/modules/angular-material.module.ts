import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule, MatExpansionPanelHeader } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import {
    MatProgressSpinner,
    MatProgressSpinnerModule
} from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import {
    MatSnackBarModule,
    MAT_SNACK_BAR_DEFAULT_OPTIONS
} from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NgModule } from '@angular/core';
import { LayoutModule } from '@angular/cdk/layout';
import { MatSelectModule } from '@angular/material/select';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import { OverlayModule } from '@angular/cdk/overlay';

@NgModule({
    imports: [
        MatButtonModule,
        MatCheckboxModule,
        MatInputModule,
        MatExpansionModule,
        MatCardModule,
        MatDividerModule,
        LayoutModule,
        MatToolbarModule,
        MatSidenavModule,
        MatIconModule,
        MatListModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatDialogModule,
        MatSnackBarModule,
        MatTabsModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        MatAutocompleteModule,
        OverlayModule
    ],
    exports: [
        MatButtonModule,
        MatCheckboxModule,
        MatInputModule,
        MatExpansionModule,
        MatCardModule,
        MatDividerModule,
        LayoutModule,
        MatToolbarModule,
        MatSidenavModule,
        MatIconModule,
        MatListModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatDialogModule,
        MatSnackBarModule,
        MatTabsModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        MatAutocompleteModule,
        OverlayModule
    ],
    providers: [
        { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 2500 } }
    ]
})
export class AngularMaterialModule {}
