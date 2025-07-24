// Test helpers for health probe tests

function setupHttpMock(httpModule, mockRequest, mockResponse, responseData) {
  httpModule.request.mockImplementation((options, callback) => {
    // Call the callback with the mock response
    callback(mockResponse);
    
    // Simulate response events
    process.nextTick(() => {
      if (responseData !== undefined) {
        mockResponse.emit('data', responseData);
      }
      mockResponse.emit('end');
    });
    
    return mockRequest;
  });
}

function setupHttpErrorMock(httpModule, mockRequest, error) {
  httpModule.request.mockImplementation((options, callback) => {
    // Simulate error event
    process.nextTick(() => {
      mockRequest.emit('error', error);
    });
    
    return mockRequest;
  });
}

function setupHttpTimeoutMock(httpModule, mockRequest) {
  httpModule.request.mockImplementation((options, callback) => {
    // Simulate timeout event
    process.nextTick(() => {
      mockRequest.emit('timeout');
    });
    
    return mockRequest;
  });
}

module.exports = {
  setupHttpMock,
  setupHttpErrorMock,
  setupHttpTimeoutMock
};