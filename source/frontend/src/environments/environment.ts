import { runtimeApiUrl } from './runtime-config';

export const environment = {
  production: false,
  // Local backend (npm run dev in source/backend); /config.js overrides it when served by the Express server
  apiurl: runtimeApiUrl('http://localhost:8080/'),
  apiVersion: '1.0.0'
};
