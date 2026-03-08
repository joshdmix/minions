import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, setLogLevel, logger } from '../../src/utils/logger.js';

describe('logger', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('debug');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  describe('log()', () => {
    it('outputs to console.error', () => {
      log('info', 'test', 'hello');
      expect(spy).toHaveBeenCalledOnce();
    });

    it('includes component and message in output', () => {
      log('info', 'MyComponent', 'something happened');
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('MyComponent');
      expect(output).toContain('something happened');
    });

    it('includes JSON data when provided', () => {
      log('info', 'test', 'with data', { key: 'value', count: 42 });
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain(JSON.stringify({ key: 'value', count: 42 }));
    });

    it('does not include data suffix when data is not provided', () => {
      log('info', 'test', 'no data');
      const output = spy.mock.calls[0][0] as string;
      expect(output).toMatch(/no data$/);
    });

    it('includes the level in uppercase', () => {
      log('warn', 'test', 'msg');
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('WARN');
    });

    it('respects minimum level - filters out debug and info when set to warn', () => {
      setLogLevel('warn');

      log('debug', 'test', 'debug msg');
      log('info', 'test', 'info msg');
      expect(spy).not.toHaveBeenCalled();

      log('warn', 'test', 'warn msg');
      expect(spy).toHaveBeenCalledOnce();

      log('error', 'test', 'error msg');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('filters nothing when level is debug', () => {
      setLogLevel('debug');
      log('debug', 'test', 'msg');
      log('info', 'test', 'msg');
      log('warn', 'test', 'msg');
      log('error', 'test', 'msg');
      expect(spy).toHaveBeenCalledTimes(4);
    });

    it('only allows error when level is error', () => {
      setLogLevel('error');
      log('debug', 'test', 'msg');
      log('info', 'test', 'msg');
      log('warn', 'test', 'msg');
      expect(spy).not.toHaveBeenCalled();

      log('error', 'test', 'msg');
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe('setLogLevel()', () => {
    it('changes filtering behavior dynamically', () => {
      setLogLevel('error');
      log('warn', 'test', 'should not appear');
      expect(spy).not.toHaveBeenCalled();

      setLogLevel('warn');
      log('warn', 'test', 'should appear');
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe('logger shortcuts', () => {
    it('logger.debug calls log with debug level', () => {
      logger.debug('comp', 'debug msg', { a: 1 });
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('DEBUG');
      expect(output).toContain('comp');
      expect(output).toContain('debug msg');
      expect(output).toContain(JSON.stringify({ a: 1 }));
    });

    it('logger.info calls log with info level', () => {
      logger.info('comp', 'info msg');
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('INFO');
      expect(output).toContain('info msg');
    });

    it('logger.warn calls log with warn level', () => {
      logger.warn('comp', 'warn msg');
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('WARN');
      expect(output).toContain('warn msg');
    });

    it('logger.error calls log with error level', () => {
      logger.error('comp', 'error msg');
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain('ERROR');
      expect(output).toContain('error msg');
    });

    it('logger shortcuts respect log level filtering', () => {
      setLogLevel('error');
      logger.debug('c', 'msg');
      logger.info('c', 'msg');
      logger.warn('c', 'msg');
      expect(spy).not.toHaveBeenCalled();

      logger.error('c', 'msg');
      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
