import { inject, provideEnvironmentInitializer } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

const PATCHED_FLAG = Symbol('modal-open-a11y-patched');

type PatchedModalService = NgbModal & { [PATCHED_FLAG]?: boolean };

function blurFocusedElement(): void {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
        activeElement.blur();
    }
}

export function provideModalA11yInitializer() {
    return provideEnvironmentInitializer(() => {
        const modalService = inject(NgbModal);
        const patchedService = modalService as PatchedModalService;

        if (patchedService[PATCHED_FLAG]) {
            return;
        }

        const originalOpen = modalService.open.bind(modalService);
        modalService.open = ((...args: Parameters<NgbModal['open']>): ReturnType<NgbModal['open']> => {
            blurFocusedElement();
            return originalOpen(...args);
        }) as NgbModal['open'];

        patchedService[PATCHED_FLAG] = true;
    });
}
