export interface ErrorType {
  type: string;
  message: string;
}

export const errors = {
  arvan: {
    accountNotFound: {
      type: 'arvan.accountNotFound',
      message: 'Arvan account is wrong.',
    },
    failAddingFakeDomain: {
      type: 'arvan.failAddingFakeDomain',
      message: "We could't add a fake domain",
    },
    domainAlreadyRegistered: {
      type: 'arvan.domainAlreadyRegistered',
      message: 'Domain is already registered.',
    },
  },
  server: {
    addingServerFailed: {
      type: 'arvan.addingServerFailed',
      message: "We can't connect to the server.",
    },
    serverAlreadyExist: {
      type: 'arvan.serverAlreadyExist',
      message: 'Server already exist.',
    },
  },
};
