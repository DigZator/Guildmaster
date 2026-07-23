function formatCurrency(gp) {
    if (gp == null) return '—';
    const sign = gp < 0 ? '-' : '';
    const totalCp = Math.round(Math.abs(gp) * 100);
    const g  = Math.floor(totalCp / 100);
    const s  = Math.floor((totalCp % 100) / 10);
    const c  = totalCp % 10;

    const parts = [];
    if (g) parts.push(`${g} gp`);
    if (s) parts.push(`${s} sp`);
    if (c) parts.push(`${c} cp`);
    return parts.length ? sign + parts.join(' ') : '0 gp';
}

module.exports = { formatCurrency };
