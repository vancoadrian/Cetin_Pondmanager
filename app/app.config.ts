export default defineAppConfig({
  ui: {
    colors: {
      primary: 'primary',
      neutral: 'slate',
      success: 'success',
      warning: 'warning',
      error: 'error',
      info: 'info',
    },
    button: {
      defaultVariants: {
        size: 'md',
        color: 'primary',
      },
    },
    card: {
      slots: {
        root: 'rounded-card border-border shadow-sm',
      },
    },
  },
})
