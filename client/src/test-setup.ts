import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@solidjs/testing-library';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
