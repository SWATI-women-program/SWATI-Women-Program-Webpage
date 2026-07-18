import os
import logging
from dotenv import load_dotenv

# 1. Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 2. Load Environment Variables
load_dotenv()
API_KEY = os.getenv("API_KEY")
DB_URL = os.getenv("DATABASE_URL")

# 3. Input Validation Feature
def validate_user_input(data):
    if not data or not isinstance(data, str):
        logger.warning("Invalid input received.")
        return False
    return True

# 4. Main Core Feature Function
def process_core_logic(user_input):
    if not validate_user_input(user_input):
        return {"status": "error", "message": "Invalid input provided."}
    
    logger.info(f"Processing data: {user_input}")
    
    # Unnoda main logic enga varum
    result = f"Successfully processed: {user_input.upper()}"
    
    return {"status": "success", "data": result}

# 5. Execution Block
if __name__ == "__main__":
    logger.info("Application started successfully.")
    
    # Mock check to see if env variables are loaded
    if not API_KEY:
        logger.error("API Key missing! Check your .env file.")
    
    # Sample run
    sample_input = "super da pakka feature"
    response = process_core_logic(sample_input)
    
    print("\n--- Output ---")
    print(response)
    print("--------------\n")
    
    logger.info("Application finished execution.")