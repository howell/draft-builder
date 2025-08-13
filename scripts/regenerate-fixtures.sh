#!/bin/bash

# Script to regenerate all E2E test fixtures
# This ensures we have fresh, consistent test data using the app's actual PlatformApi classes
# Usage: ./scripts/regenerate-fixtures.sh [--help]

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BASE_URL="http://localhost:3000"
FIXTURES_API="$BASE_URL/api/dev/generate-fixtures"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Help function
show_help() {
    echo "Generate E2E test fixtures for fantasy platforms"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -e, --espn     Generate only ESPN fixtures (default: both)"
    echo "  -s, --sleeper  Generate only Sleeper fixtures (default: both)"
    echo "  -p, --port PORT    Use custom port (default: 3000)"
    echo ""
    echo "Examples:"
    echo "  $0                  # Generate all fixtures"
    echo "  $0 --espn           # Generate only ESPN fixtures"
    echo "  $0 --sleeper        # Generate only Sleeper fixtures"
    echo "  $0 --port 3001      # Use port 3001"
    echo ""
    echo "Prerequisites:"
    echo "  - Development server must be running (npm run dev)"
    echo "  - Internet connection (to fetch real data from platforms)"
    echo ""
}

# Default options
GENERATE_ESPN=true
GENERATE_SLEEPER=true
PORT=3000

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -e|--espn)
            GENERATE_ESPN=true
            GENERATE_SLEEPER=false
            shift
            ;;
        -s|--sleeper)
            GENERATE_ESPN=false
            GENERATE_SLEEPER=true
            shift
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

BASE_URL="http://localhost:$PORT"
FIXTURES_API="$BASE_URL/api/dev/generate-fixtures"

# Function to check if server is running
check_server() {
    echo -e "${BLUE}Checking if development server is running on port $PORT...${NC}"
    
    if ! curl -f -s "$BASE_URL" > /dev/null 2>&1; then
        echo -e "${RED}❌ Development server is not running on port $PORT${NC}"
        echo -e "${YELLOW}Please start the development server with: npm run dev${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Development server is running${NC}"
}

# Function to generate fixtures for a platform
generate_fixtures() {
    local platform=$1
    local emoji=$2
    
    echo -e "${BLUE}${emoji} Generating $platform fixtures...${NC}"
    
    # Create the request body
    local request_body="{\"platform\": \"$platform\"}"
    
    # Make the API request
    local response
    if response=$(curl -f -s -X POST \
        -H "Content-Type: application/json" \
        -d "$request_body" \
        "$FIXTURES_API" 2>&1); then
        
        # Extract key information from the response
        local league_name=$(echo "$response" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
        local generation_time=$(echo "$response" | grep -o '"generationTimeMs":[0-9]*' | cut -d':' -f2)
        local endpoints_count=$(echo "$response" | grep -o '"endpoints":\\[.*\\]' | grep -o ',' | wc -l)
        endpoints_count=$((endpoints_count + 1))
        
        echo -e "${GREEN}  ✅ Generated $endpoints_count fixtures for \"$league_name\" in ${generation_time}ms${NC}"
        
        # Show saved files
        local files=$(echo "$response" | grep -o '"files":\\[.*\\]' | sed 's/"files":\\[//; s/\\]//; s/","/\n/g' | sed 's/"//g')
        echo -e "${GREEN}  📁 Saved files:${NC}"
        while IFS= read -r file; do
            if [[ -n "$file" ]]; then
                echo -e "${GREEN}     • $file${NC}"
            fi
        done <<< "$files"
        
        return 0
    else
        echo -e "${RED}  ❌ Failed to generate $platform fixtures${NC}"
        echo -e "${RED}     Error: $response${NC}"
        return 1
    fi
}

# Function to clean up old fixture files (optional)
cleanup_fixtures() {
    echo -e "${YELLOW}🧹 Cleaning up old fixture directories...${NC}"
    
    local fixtures_dir="$PROJECT_DIR/e2e/fixtures"
    
    if [[ "$GENERATE_ESPN" == "true" ]]; then
        if [[ -d "$fixtures_dir/espn" ]]; then
            rm -rf "$fixtures_dir/espn"
            echo -e "${YELLOW}   • Removed old ESPN fixtures${NC}"
        fi
    fi
    
    if [[ "$GENERATE_SLEEPER" == "true" ]]; then
        if [[ -d "$fixtures_dir/sleeper" ]]; then
            rm -rf "$fixtures_dir/sleeper"
            echo -e "${YELLOW}   • Removed old Sleeper fixtures${NC}"
        fi
    fi
}

# Main execution
main() {
    echo -e "${BLUE}🚀 Fantasy Platform Fixture Generator${NC}"
    echo -e "${BLUE}====================================${NC}"
    echo ""
    
    # Check server availability
    check_server
    echo ""
    
    # Optional: Clean up old fixtures
    cleanup_fixtures
    echo ""
    
    local success_count=0
    local total_count=0
    
    # Generate ESPN fixtures
    if [[ "$GENERATE_ESPN" == "true" ]]; then
        total_count=$((total_count + 1))
        if generate_fixtures "espn" "🏈"; then
            success_count=$((success_count + 1))
        fi
        echo ""
    fi
    
    # Generate Sleeper fixtures
    if [[ "$GENERATE_SLEEPER" == "true" ]]; then
        total_count=$((total_count + 1))
        if generate_fixtures "sleeper" "😴"; then
            success_count=$((success_count + 1))
        fi
        echo ""
    fi
    
    # Summary
    echo -e "${BLUE}📊 Summary${NC}"
    echo -e "${BLUE}==========${NC}"
    if [[ "$success_count" -eq "$total_count" ]]; then
        echo -e "${GREEN}✅ Successfully generated fixtures for $success_count/$total_count platforms${NC}"
        echo ""
        echo -e "${GREEN}🎉 All fixtures are ready for E2E testing!${NC}"
        echo ""
        echo -e "${BLUE}Next steps:${NC}"
        echo -e "${BLUE}  1. Implement fixture-based PlatformApi for dependency injection${NC}"
        echo -e "${BLUE}  2. Update E2E tests to use the new fixtures${NC}"
        echo -e "${BLUE}  3. Test the migration service with deterministic data${NC}"
    else
        echo -e "${RED}❌ Generated fixtures for $success_count/$total_count platforms${NC}"
        echo -e "${RED}   Some fixture generation failed. Check the errors above.${NC}"
        exit 1
    fi
}

# Run main function
main "$@"