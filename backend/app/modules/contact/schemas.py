from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactMessageIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    business: str | None = Field(default=None, max_length=160)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=40)
    topic: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=5000)
    website: str | None = Field(default=None, max_length=200)


class ContactMessageResponse(BaseModel):
    detail: str = "Thanks — your message has been sent."
