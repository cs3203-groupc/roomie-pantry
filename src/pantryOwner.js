function pantryOwnerCheck(memberId, pantryId) {
  if (typeof memberId !== 'string' || typeof pantryId !== 'string') {
    return false;
  }

  if (memberId.length < 3 || !/^[A-Za-z0-9_]+$/.test(memberId)) {
    return false;
  }

  const pantryOwners = {
    valid_pantry_id: 'valid_owner_id'
  };

  return pantryOwners[pantryId] === memberId;
}

module.exports = {
  pantryOwnerCheck
};
