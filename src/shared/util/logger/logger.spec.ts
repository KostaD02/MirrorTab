import { Logger } from './logger';
import { APP_NAME } from '@/shared/consts';

describe('Logger Class', () => {
  let mockConsole: Console;
  const MOCK_DATE = new Date('2026-03-07T12:00:00');

  beforeEach(() => {
    mockConsole = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as unknown as Console;

    jest.useFakeTimers();
    jest.setSystemTime(MOCK_DATE);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const getExpectedPrefix = (prefix = APP_NAME) => {
    const dateStr = MOCK_DATE.toLocaleDateString();
    const timeStr = MOCK_DATE.toLocaleTimeString();
    return `[${prefix}] [${dateStr} ${timeStr}]`;
  };

  it('should use the default APP_NAME prefix if none provided', () => {
    const logger = new Logger(undefined, mockConsole);
    logger.log('test message');

    expect(mockConsole.log).toHaveBeenCalledWith(
      getExpectedPrefix(APP_NAME),
      'test message',
    );
  });

  it('should use a custom prefix when provided', () => {
    const customPrefix = 'MY_EXTENSION';
    const logger = new Logger(customPrefix, mockConsole);
    logger.log('hello');

    expect(mockConsole.log).toHaveBeenCalledWith(
      getExpectedPrefix(customPrefix),
      'hello',
    );
  });

  it('should format logs correctly with multiple arguments', () => {
    const logger = new Logger('TEST', mockConsole);
    const data = { user: 'Kosta' };
    logger.log('User logged in:', data, 123);

    expect(mockConsole.log).toHaveBeenCalledWith(
      getExpectedPrefix('TEST'),
      'User logged in:',
      data,
      123,
    );
  });

  it('should call console.error when calling logger.error()', () => {
    const logger = new Logger('TEST', mockConsole);
    logger.error('Critical failure');

    expect(mockConsole.error).toHaveBeenCalledWith(
      getExpectedPrefix('TEST'),
      'Critical failure',
    );
  });

  it('should call console.warn when calling logger.warn()', () => {
    const logger = new Logger('TEST', mockConsole);
    logger.warn('Warning message');

    expect(mockConsole.warn).toHaveBeenCalledWith(
      getExpectedPrefix('TEST'),
      'Warning message',
    );
  });
});
