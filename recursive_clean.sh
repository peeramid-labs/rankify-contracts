#!/bin/bash

target_branch="main"

# Function to find and delete merged branches into a given base branch
delete_merged_into() {
  base_branch="$1"
  echo "--- Processing branches merged into: $base_branch ---"
  git branch --merged "$base_branch" | grep -v "$(echo "$base_branch" | sed 's/$/$/')" | while read -r branch; do
    echo "Checking if '$branch' can be deleted..."
    if git branch --show-current | grep -q "^$branch$"; then
      echo "Skipping currently checked out branch: $branch"
    elif git branch -d "$branch"; then
      echo "Successfully deleted: $branch"
    else
      echo "Warning: Could not delete '$branch'. It might not be fully merged or has unpushed commits."
      echo "         Use 'git branch -D $branch' to force delete (with caution!)."
    fi
  done
  echo ""
}

# Start from the top and work downwards
branches_to_process=("$target_branch")
processed_branches=()

while IFS= read -r current_base_branch <<< "${branches_to_process[0]}"; do
  branches_to_process=("${branches_to_process[@]:1}") # Remove the processed branch

  # Find branches merged into the current base branch
  merged_branches=$(git branch --merged "$current_base_branch" | grep -v "$(echo "$current_base_branch" | sed 's/$/$/')")

  # Delete the merged branches
  echo "Deleting branches merged into '$current_base_branch':"
  echo "$merged_branches" | while read -r branch_to_delete; do
    if [[ ! " ${processed_branches[@]} " =~ " ${branch_to_delete} " ]]; then
      if git branch --show-current | grep -q "^$branch_to_delete$"; then
        echo "Skipping currently checked out branch: $branch_to_delete"
      elif git branch -d "$branch_to_delete"; then
        echo "Deleted: $branch_to_delete"
      else
        echo "Warning: Could not delete '$branch_to_delete'. May not be fully merged."
      fi
      processed_branches+=("$branch_to_delete")
    fi
  done

  # Add the newly found merged branches to the processing list
  IFS=$'\n' read -d '' -r -a new_branches <<< "$merged_branches"
  branches_to_process+=("${new_branches[@]}")

  # Remove duplicates from the processing list (optional, for efficiency)
  unique_branches=()
  for branch in "${branches_to_process[@]}"; do
    if [[ ! " ${unique_branches[@]} " =~ " ${branch} " ]]; then
      unique_branches+=("$branch")
    fi
  done
  branches_to_process=("${unique_branches[@]}")

  # If the processing list becomes empty, we're done
  if [ ${#branches_to_process[@]} -eq 0 ]; then
    break
  fi
done

echo "--- Recursive branch cleanup complete ---"
