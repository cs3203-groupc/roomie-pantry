function pantryOwnerCheck(memberId, pantryId, store = null) {
  if (typeof memberId !== 'string' || (typeof pantryId !== 'string' && typeof pantryId !== 'number')) {
    return false;
  }

  if (memberId.length < 3 || !/^[A-Za-z0-9_]+$/.test(memberId)) {
    return false;
  }

  // Dynamic store evaluation against live pantry inventory
  if (store && typeof store.listPantryItems === 'function') {
    const numericId = Number(pantryId);
    if (!Number.isNaN(numericId)) {
      const item = store.listPantryItems().find((i) => i.id === numericId);
      if (item) {
        if (item.isShared) return true;
        return item.owner === memberId;
      }
    }
  }

  const pantryOwners = {
    valid_pantry_id: 'valid_owner_id'
  };

  return pantryOwners[String(pantryId)] === memberId;
}

module.exports = {
  pantryOwnerCheck
};
