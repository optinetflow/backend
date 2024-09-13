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
  xui: {
    accountNotFound: {
      type: 'xui.accountNotFound',
      message: 'X-UI account is wrong.',
    },
    addClientError: {
      type: 'xui.addClientError',
      message: 'Add client failed.',
    },
    updateClientError: {
      type: 'xui.updateClientError',
      message: 'Update client failed.',
    },
    deleteClientError: {
      type: 'xui.deleteClientError',
      message: 'Delete client failed.',
    },
    delDepletedClients: {
      type: 'xui.delDepletedClients',
      message: 'Delete all depleted clients failed.',
    },
    updatePaymentFailed: {
      type: 'xui.updatePaymentFailed',
      message: 'Update payment got failed.',
    },
  },
};
