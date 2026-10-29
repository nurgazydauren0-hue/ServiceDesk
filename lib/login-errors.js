import { CredentialsSignin } from '@auth/core/errors';

export class LoginServiceUnavailable extends CredentialsSignin {
  code = 'service_unavailable';
}

export class LoginRateLimited extends CredentialsSignin {
  code = 'rate_limited';
}
