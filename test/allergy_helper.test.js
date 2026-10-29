const AllergyHelper = require('./allergy_helper');

describe('AllergyHelper Add Tests', () => {
    let helper;

    beforeEach(() => {
        helper = new AllergyHelper();
    });

    test('valid allergy string', () => {
        expect(helper.add("Peanuts")).toBe(true);
    });

    test('invalid data types', () => {
        expect(helper.add(true)).toBe(false);
        expect(helper.add(null)).toBe(false);
        expect(helper.add(123)).toBe(false);
    });

    test('boundary minimum characters', () => {
        expect(helper.add("A")).toBe(false);
        expect(helper.add("Pe")).toBe(true);
    });

    test('edge empty and whitespace', () => {
        expect(helper.add("")).toBe(false);
        expect(helper.add("   ")).toBe(false);
    });
});
