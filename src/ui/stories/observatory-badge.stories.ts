import type { Meta, StoryObj } from '@storybook/web-components';

interface BadgeArgs {
  readonly count: number;
  readonly state: 'connected' | 'observed' | 'disconnected';
}

const meta = {
  title: 'Observatory/Peer badge',
  tags: ['autodocs'],
  argTypes: {
    count: { control: { type: 'number', min: 0 } },
    state: {
      control: 'select',
      options: ['connected', 'observed', 'disconnected'],
    },
  },
  args: { count: 12, state: 'connected' },
  render: ({ count, state }: BadgeArgs) => {
    const element = document.createElement('span');
    element.textContent = `${state} · ${count} peers`;
    element.style.cssText =
      'display:inline-flex;min-height:44px;align-items:center;border:1px solid #73fbd3;border-radius:999px;color:#c9ff70;padding:0 16px;font:600 14px/1.2 system-ui';
    return element;
  },
} satisfies Meta<BadgeArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
