class AllergyHelper:
    def __init__(self):
        self.allergies = set()

    def add(self, item):
        if not isinstance(item, str) or isinstance(item, bool):
            return False

        cleaned = item.strip()
        if len(cleaned) < 2:
            return False

        self.allergies.add(cleaned)
        return True