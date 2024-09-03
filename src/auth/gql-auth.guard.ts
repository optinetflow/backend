import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);

    return ctx.getContext().req;
  }
}

@Injectable()
export class OptionalGqlAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly jwtService: JwtStrategy, private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;

    const token = req?.cookies?.token && JSON.parse(req.cookies.token).accessT;

    if (token) {
      const user = await this.authService.getUserFromToken(token);
      req.user = user;
    }

    return true;
  }

  getRequest(context: ExecutionContext) {
    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext();

    return ctx.req;
  }
}
