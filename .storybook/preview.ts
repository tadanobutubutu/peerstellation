import type { Preview } from '@storybook/web-components';

const preview: Preview = {
  parameters: {
    a11y: {
      test: 'error',
    },
    backgrounds: {
      default: 'ink',
      values: [{ name: 'ink', value: '#050508' }],
    },
  },
};

export default preview;
