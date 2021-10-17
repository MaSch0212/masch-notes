import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'masch-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
    private redirectTo: string;

    constructor(
        private router: Router,
        private activatedRoute: ActivatedRoute
    ) {}

    ngOnInit() {
        this.activatedRoute.queryParams.subscribe(params => {
            this.redirectTo = params['redirectTo'] || '/';
        });
    }

    onLogin() {
        this.navigateBack();
    }

    onRegister() {
        this.navigateBack();
    }

    private navigateBack() {
        this.router.navigateByUrl(this.redirectTo);
    }
}
