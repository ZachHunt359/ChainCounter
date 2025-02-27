import json
from collections import defaultdict
import argparse


def load_json(file_path):
    """Load JSON data from a file."""
    with open(file_path, "r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, dict):
        raise ValueError("Invalid JSON format: Expected a dictionary at the top level.")

    return data



def process_purchases(data):
    """Process the purchases and return counts per jump."""
    type_mappings = {1: "Items", 2: "Alt-Forms", 3: "Drawbacks"}
    jump_totals = defaultdict(lambda: {"Items": 0, "Alt-Forms": 0, "Drawbacks": 0})
    jump_list = data.get("jumps", [])
    if isinstance(jump_list, str):
        raise ValueError("Expected 'jumps' to be a list of dictionaries, but got a string.")

    jump_names = {int(jump_id): jump_data.get("name", "Unknown Jump") for jump_id, jump_data in data.get("jumps", {}).items()}
    
    for purchase in data.get("purchases", {}).values():
        if purchase.get("_characterId") == 0:
            jump_id = purchase.get("_jumpId")
            item_type = purchase.get("_type")
            if item_type in type_mappings:
                jump_totals[jump_id][type_mappings[item_type]] += 1
    
    return jump_totals, jump_names


def print_results(jump_totals, jump_names):
    """Print the formatted results."""
    for jump_id, counts in sorted(jump_totals.items()):
        jump_name = jump_names.get(jump_id, f"Jump {jump_id}")
        print(f"{jump_name} (Jump {jump_id}):")
        for category, count in counts.items():
            print(f"  {category}: {count}")
        print()


def main():
    """Main function to handle argument parsing and execution."""
    parser = argparse.ArgumentParser(description="Process a JumpChain JSON file.")
    parser.add_argument("file", help="Path to the JumpChain JSON file")
    args = parser.parse_args()
    
    data = load_json(args.file)
    jump_totals, jump_names = process_purchases(data)
    print_results(jump_totals, jump_names)


if __name__ == "__main__":
    main()
