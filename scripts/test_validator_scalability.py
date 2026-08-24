import unittest

from scripts import validate_conversion_rebuild as validator


class ValidatorScalabilityTests(unittest.TestCase):
    def test_manifest_cardinality_accepts_the_next_article(self):
        posts = [
            {
                "category": "Techniques",
                "slug": f"article-{number}",
            }
            for number in range(1, 89)
        ]
        catalog = {
            f"/blog/article-{number}/": {}
            for number in range(1, 89)
        }
        validation = validator.Validation()

        validator.validate_manifest_cardinality(validation, posts, catalog)

        self.assertEqual(validation.errors, [])

    def test_manifest_cardinality_rejects_an_empty_manifest(self):
        validation = validator.Validation()

        validator.validate_manifest_cardinality(validation, [], {})

        self.assertEqual(validation.errors, ["article manifest is empty"])


if __name__ == "__main__":
    unittest.main()
