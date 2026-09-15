import { MantineThemeOverride } from '@mantine/core';

export const theme: MantineThemeOverride = {
  primaryColor: 'brand',
  colors: {
    brand: ['#eaf3ee', '#cbe2d5', '#a0cbb3', '#6cad8b', '#3d8c67', '#23724e', '#1b4332', '#163a2b', '#102b20', '#0a1c15'],
    accent: ['#fff7e8', '#ffe9bd', '#ffd685', '#ffbf4d', '#ffab24', '#f59e0b', '#cc8000', '#a36300', '#7a4a00', '#523100'],
    success: ['#eafbf0', '#c8f5da', '#9fedbf', '#6fe3a0', '#3fd383', '#1fb968', '#159654', '#0f7743', '#0b5c34', '#074327'],
    danger: ['#fdecec', '#fad0d0', '#f5a8a8', '#ee7a7a', '#e65252', '#dc2f2f', '#b82323', '#941c1c', '#711515', '#4f0f0f'],
    warning: ['#fdf3e8', '#f9deb8', '#f3c485', '#eba74d', '#e28c24', '#d97706', '#b35f04', '#8c4a03', '#663602', '#402201'],
  },
  radius: { sm: '8px', md: '12px', lg: '16px', xl: '20px' },
  defaultRadius: 'lg',
  shadows: {
    sm: '0 1px 2px rgba(16,24,40,0.05)',
    md: '0 4px 12px rgba(16,24,40,0.06)',
  },
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  components: {
    Card: { defaultProps: { radius: 'lg', shadow: 'sm', withBorder: false, padding: 'lg' } },
    Button: { defaultProps: { radius: 'md' } },
    Table: { defaultProps: { verticalSpacing: 'sm', highlightOnHover: true } },
  },
};