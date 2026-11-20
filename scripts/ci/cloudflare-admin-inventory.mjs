function check(condition, code) {
  if (!condition) throw new Error(code);
}

export async function listAdminInventory(cf, path, { allowUnpaginated = false } = {}) {
  const items = [];
  const ids = new Set();
  let expectedInventory = null;
  for (let page = 1; page <= 10; page++) {
    const data = await cf(`${path}?per_page=100&page=${page}`);
    check(Array.isArray(data.result) && data.result.length <= 100, 'admin_rebind_provider_inventory_invalid');
    const hasInfo = Object.hasOwn(data, 'result_info');
    const info = data.result_info;
    let totalPages;
    if (!hasInfo) {
      // Only the Workers routes API documents an unpaginated array response.
      check(allowUnpaginated && page === 1, 'admin_rebind_provider_pagination_missing');
    } else {
      check(info && typeof info === 'object' && !Array.isArray(info), 'admin_rebind_provider_pagination_invalid');
      const total = info.total_count;
      const hasPages = Object.hasOwn(info, 'total_pages');
      const perPage = info.per_page ?? (hasPages ? 100 : undefined);
      const derivedPages = Math.ceil(total / perPage);
      totalPages = hasPages ? info.total_pages : derivedPages;
      check(Number.isInteger(totalPages) && totalPages >= 0 && totalPages <= 10 && info.page === page
        && Number.isInteger(total) && total >= 0 && total <= 1000
        && Number.isInteger(perPage) && perPage > 0 && perPage <= 100
        && (totalPages === derivedPages || (total === 0 && totalPages === 1))
        && (page <= totalPages || (page === 1 && totalPages === 0 && total === 0))
        && data.result.length === Math.min(perPage, Math.max(0, total - (page - 1) * perPage))
        && (info.count === undefined || info.count === data.result.length), 'admin_rebind_provider_pagination_invalid');
      const inventory = JSON.stringify({ totalPages, total, perPage });
      check(expectedInventory === null || expectedInventory === inventory, 'admin_rebind_provider_pagination_changed');
      expectedInventory = inventory;
    }
    for (const item of data.result) {
      check(typeof item?.id === 'string' && item.id.length > 0 && !ids.has(item.id), 'admin_rebind_provider_pagination_conflict');
      ids.add(item.id);
      items.push(item);
    }
    if (!hasInfo) return items;
    check(items.length <= info.total_count, 'admin_rebind_provider_pagination_incomplete');
    if (page === totalPages || totalPages === 0) {
      check(items.length === info.total_count, 'admin_rebind_provider_pagination_incomplete');
      return items;
    }
  }
  throw new Error('admin_rebind_provider_pagination_limit');
}
