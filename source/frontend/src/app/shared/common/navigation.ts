import { Location, ViewportScroller } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Router, RoutesRecognized, Scroll } from '@angular/router';
import { filter, pairwise } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class MyNavigation {
    private router = inject(Router);
    private location = inject(Location);
    private viewportScroller = inject(ViewportScroller);

    private previousUrl: string | undefined;
    scrollPosition: [number, number] = [0, 0];
    constructor() {
        this.router.events.pipe(filter((e: any) => e instanceof RoutesRecognized),
            pairwise()
        ).subscribe((e: any) => {
            this.previousUrl = e[0].urlAfterRedirects; // previous url
        });

        this.router.events.pipe(
            filter(e => e instanceof Scroll)
        ).subscribe(e => {
            const position = (e as Scroll).position;
            if (position) {
                this.scrollPosition = position;
            } else {
                this.scrollPosition = [0, 0];
            }
        });
    }

    public getPreviousUrl(defaultUrl: string): string {
        if (this.previousUrl === undefined) {
            return defaultUrl;
        }
        return this.previousUrl;
    }

    public back() {
        if (this.previousUrl === undefined) {
            this.router.navigate(['']);
        } else {
            this.location.back();
        }
    }

    // ngAfterViewInit() {
    public scroll() {
        if (this.scrollPosition) {
            this.viewportScroller.scrollToPosition(this.scrollPosition);
        }
    }

    public updateScrollPosition() {
        this.scrollPosition = this.viewportScroller.getScrollPosition();
    }
}
