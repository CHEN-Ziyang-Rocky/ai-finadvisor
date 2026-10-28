import { createTheme } from '@mui/material/styles';
export default createTheme({
    palette: { primary: { main: '#087f80' }, secondary: { main: '#667caa' }, text: { primary: '#1c3444', secondary: '#637580' }, background: { default: '#f3f6f8', paper: '#ffffff' } },
    typography: { fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 13,
        h5: { fontSize: '1.25rem', fontWeight: 700 }, h6: { fontSize: '1.1rem', fontWeight: 650 }, button: { textTransform: 'none', fontWeight: 600 }, body2: { lineHeight: 1.7 } },
    shape: { borderRadius: 12 },
    components: {
        MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #e1e8ec' } } },
        MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 8, padding: '10px 18px' } } },
        MuiTextField: { defaultProps: { size: 'small' } },
        MuiFormControl: { defaultProps: { size: 'small' } },
        MuiOutlinedInput: { styleOverrides: { root: { background: '#fff', borderRadius: 8 } } },
        MuiTableCell: { styleOverrides: { root: { padding: '14px 12px', borderBottom: '1px solid #edf1f3' }, head: { color: '#637580', fontSize:12 } } },
    },
});
