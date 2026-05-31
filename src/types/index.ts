declare global {
  namespace Express {
    interface User {
      id: string;
      // add other fields your token/session puts on req.user
      // email?: string;
      // role?: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
