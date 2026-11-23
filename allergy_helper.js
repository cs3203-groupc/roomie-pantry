
class AllergyHelper {
    constructor() {
        this.allergies = new Set();
    }

    add(item) {
        if (typeof item !== "string") {
            return false;
        }

        const cleaned = item.trim();

        if (cleaned.length < 2) {
            return false;
        }

        this.allergies.add(cleaned.toLowerCase());
        return true;
    }

    remove(item) {
        if (typeof item !== "string") {
            return false;
        }
        return this.allergies.delete(item.trim().toLowerCase());
    }

    has(item) {
        if (typeof item !== "string") {
            return false;
        }
        return this.allergies.has(item.trim().toLowerCase());
    }

    getAll() {
        return Array.from(this.allergies);
    }

    clear() {
        this.allergies.clear();
    }
}

module.exports = AllergyHelper;
