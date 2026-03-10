import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

import { AuthService } from './auth.service';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);

    return ctx.getContext().req;
  }
}

@Injectable()
export class OptionalGqlAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;

    try {
      const cookieValue = req?.cookies?.token;

      if (cookieValue) {
        const parsed = JSON.parse(cookieValue);
        const token = parsed?.accessT;

        if (token) {
          const user = await this.authService.getUserFromToken(token);
          req.user = user;
        }
      }
    } catch {
      // Malformed cookie — treat as unauthenticated
    }

    return true;
  }

  getRequest(context: ExecutionContext) {
    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext();

    return ctx.req;
  }
}

@Injectable()
export class AdminGqlAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;

    let token: string | undefined;

    try {
      const cookieValue = req?.cookies?.token;

      if (cookieValue) {
        token = JSON.parse(cookieValue)?.accessT;
      }
    } catch {
      throw new ForbiddenException('Access denied. Invalid token format.');
    }

    if (!token) {
      throw new ForbiddenException('Access denied. No token provided.');
    }

    const user = await this.authService.getUserFromToken(token);

    if (user && user.role === 'ADMIN') {
      req.user = user;

      return true;
    }

    throw new ForbiddenException('Access denied. Admins only.');
  }
}
