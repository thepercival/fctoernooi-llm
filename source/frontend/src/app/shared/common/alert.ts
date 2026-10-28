
export interface IAlert {
    type: IAlertType
    message: string;
}

export enum IAlertType {
    Info = 'info',
    Warning = 'warning',
    Danger = 'danger',
    Success = 'success',
}

