import { EventEmitter, Injectable } from '@angular/core';
import { LiveboardLink } from '../../lib/liveboard/link';
import { NavBarData } from '../layout/nav/nav.component';

@Injectable({ providedIn: 'root' })
export class GlobalEventsManager {
    public updateDataInNavBar: EventEmitter<NavBarData> = new EventEmitter();
    public showFooter: EventEmitter<boolean> = new EventEmitter();
}
