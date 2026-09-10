import { MantineThemeOverride } from '@mantine/core';

export const theme: MantineThemeOverride = {
  primaryColor: 'brand',
  colors: {
    brand: ['#f2f0ff', '#e0dbff', '#c7bdff', '#a894ff', '#8b6dff', '#6f4bff', '#5a35eb', '#4826c4', '#381c9c', '#2a1478'],
    success: ['#eafbf0', '#c8f5da', '#9fedbf', '#6fe3a0', '#3fd383', '#1fb968', '#159654', '#0f7743', '#0b5c34', '#074327'],
    danger: ['#fdecec', '#fad0d0', '#f5a8a8', '#ee7a7a', '#e65252', '#dc2f2f', '#b82323', '#941c1c', '#711515', '#4f0f0f'],
    warning: ['#fff6e5', '#ffe8b8', '#ffd685', '#ffc24d', '#ffae1f', '#f59700', '#cc7d00', '#a36300', '#7a4a00', '#523100'],
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
