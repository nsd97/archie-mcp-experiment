"""Logging configuration for the agents system."""

import logging
import sys
from contextlib import contextmanager
from typing import Any, Dict, Optional
import functools
import asyncio


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with consistent formatting.
    
    Args:
        name: The name of the logger (typically __name__)
        
    Returns:
        A configured logger instance
    """
    logger = logging.getLogger(name)
    
    # Only configure if not already configured
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        
    return logger


@contextmanager
def logging_context(**kwargs):
    """Context manager for adding context to log messages.
    
    Args:
        **kwargs: Key-value pairs to add to log context
        
    Yields:
        None
    """
    # For now, this is a no-op placeholder
    # In a real implementation, this would add context to structured logs
    yield


def log_call(func=None, *, logger=None, level=logging.INFO):
    """Decorator to log function calls.
    
    Args:
        func: The function to decorate
        logger: Optional logger instance to use
        level: Log level to use (default: INFO)
        
    Returns:
        Decorated function
    """
    def decorator(f):
        @functools.wraps(f)
        async def async_wrapper(*args, **kwargs):
            log = logger or get_logger(f.__module__)
            log.log(level, f"Calling {f.__name__}", extra={"args": args, "kwargs": kwargs})
            try:
                result = await f(*args, **kwargs)
                log.log(level, f"Completed {f.__name__}", extra={"result": result})
                return result
            except Exception as e:
                log.exception(f"Error in {f.__name__}: {e}")
                raise
                
        @functools.wraps(f)
        def sync_wrapper(*args, **kwargs):
            log = logger or get_logger(f.__module__)
            log.log(level, f"Calling {f.__name__}", extra={"args": args, "kwargs": kwargs})
            try:
                result = f(*args, **kwargs)
                log.log(level, f"Completed {f.__name__}", extra={"result": result})
                return result
            except Exception as e:
                log.exception(f"Error in {f.__name__}: {e}")
                raise
                
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(f):
            return async_wrapper
        else:
            return sync_wrapper
            
    if func is None:
        # Called with arguments
        return decorator
    else:
        # Called without arguments
        return decorator(func)