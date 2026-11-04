
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

        this.allergies.add(cleaned);
        return true;
    }
}

module.exports = AllergyHelper;
