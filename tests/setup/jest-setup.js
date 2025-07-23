// Mock Express/Koa request and response objects for testing
global.mockReq = (overrides = {}) => ({
  headers: {},
  body: {},
  query: {},
  params: {},
  ip: '127.0.0.1',
  connection: { remoteAddress: '127.0.0.1' },
  socket: { remoteAddress: '127.0.0.1' },
  ...overrides
});

global.mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
    locals: {}
  };
  return res;
};

global.mockNext = jest.fn();