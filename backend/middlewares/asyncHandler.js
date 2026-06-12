// Complete version with custom error handling
const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    // Custom error handling
    if (process.env.NODE_ENV === 'development') {
      console.error('AsyncHandler Error:', {
        message: error.message,
        stack: error.stack,
        route: req.originalUrl,
        method: req.method,
      });
    }

    // Determine status code
    const statusCode = error.statusCode || 500;
    
    // Send error response
    res.status(statusCode).json({
      success: false,
      error: process.env.NODE_ENV === 'production' 
        ? 'Server Error' 
        : error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

module.exports = asyncHandler;