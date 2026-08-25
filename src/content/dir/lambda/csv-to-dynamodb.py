import csv
import boto3

dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
table = dynamodb.Table("MyTable")

with open("data.csv", "r", encoding="utf-8") as csvfile:
    reader = csv.DictReader(csvfile)

    with table.batch_writer() as batch:
        for row in reader:
            item = {
                "id": row["id"],
                "name": row["name"],
                "age": int(row["age"])
            }

            batch.put_item(Item=item)

print("Done")