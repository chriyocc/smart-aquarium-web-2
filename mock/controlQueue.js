let pendingCommand = null;

export const setCommand = (command) => {
  pendingCommand = command;
};

export const getCommand = () => {
  const cmd = pendingCommand;
  pendingCommand = null; // clear after read
  return cmd;
};
