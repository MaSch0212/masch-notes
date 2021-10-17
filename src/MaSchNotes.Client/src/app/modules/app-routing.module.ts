import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuardService } from '../services/auth-guard.service';
import { OverviewComponent } from '../components/overview/overview.component';
import { HomeComponent } from '../components/home/home.component';
import { SettingsComponent } from '../components/settings/settings.component';
import { ErrorPageComponent } from '../components/error-page/error-page.component';
import { NotebookComponent } from '../components/notebooks/notebook/notebook.component';
import { NotebookOverviewComponent } from '../components/notebook-overview/notebook-overview.component';
import { NotebooksComponent } from '../components/notebooks/notebooks.component';
import { NotebookEntryComponent } from '../components/notebooks/notebook/notebook-entry/notebook-entry.component';
import { DayRatingComponent } from '../components/day-rating/day-rating.component';

const appRoutes: Routes = [
    {
        path: '',
        redirectTo: '/overview',
        pathMatch: 'full'
    },
    {
        path: 'overview',
        component: OverviewComponent,
        canActivate: [AuthGuardService]
    },
    {
        path: 'dayratings',
        component: DayRatingComponent,
        canActivate: [AuthGuardService]
    },
    {
        path: 'notebooks',
        component: NotebookOverviewComponent,
        canActivate: [AuthGuardService],
        children: [
            {
                path: '',
                component: NotebooksComponent,
                pathMatch: 'full',
                canActivate: [AuthGuardService]
            },
            {
                path: ':notebookid',
                component: NotebookComponent,
                canActivate: [AuthGuardService]
            },
            {
                path: ':notebookid/new',
                component: NotebookEntryComponent,
                canActivate: [AuthGuardService]
            },
            {
                path: ':notebookid/:entryid',
                component: NotebookEntryComponent,
                canActivate: [AuthGuardService]
            },
        ]
    },
    {
        path: 'login',
        component: HomeComponent,
        canActivate: [AuthGuardService]
    },
    {
        path: 'logoff',
        component: HomeComponent,
        canActivate: [AuthGuardService]
    },
    {
        path: 'settings',
        component: SettingsComponent,
        canActivate: [AuthGuardService]
    },
    {
        path: 'not-found',
        component: ErrorPageComponent,
        data: { message: 'notFound' }
    },
    {
        path: '**',
        redirectTo: '/not-found'
    }
];

@NgModule({
    imports: [RouterModule.forRoot(appRoutes)],
    exports: [RouterModule]
})
export class AppRoutingModule {}
